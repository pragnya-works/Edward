import type { Framework, WorkflowState } from "../../../../services/planning/schemas.js";
import { getSandboxState } from "../../../../services/sandbox/state.service.js";
import { normalizeFramework } from "../../../../services/sandbox/templates/template.registry.js";
import { saveWorkflow } from "../../../../services/planning/workflow/store.js";

interface ResolveFrameworkParams {
  workflow: WorkflowState;
  framework: Framework | undefined;
}

export async function resolveFramework(
  params: ResolveFrameworkParams,
): Promise<Framework | undefined> {
  const { workflow } = params;
  let { framework } = params;

  if (!framework && workflow.sandboxId) {
    const sandboxState = await getSandboxState(workflow.sandboxId);
    if (sandboxState?.scaffoldedFramework) {
      const recovered = normalizeFramework(sandboxState.scaffoldedFramework);
      if (recovered) {
        framework = recovered;
        workflow.context.framework = framework;
        await saveWorkflow(workflow);
      }
    }
  }

  return framework;
}
