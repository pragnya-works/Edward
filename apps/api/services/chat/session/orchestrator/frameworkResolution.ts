import type { Framework, WorkflowState } from "../../../../services/planning/schemas.js";
import { getSandboxState } from "../../../../services/sandbox/state.service.js";
import { normalizeFramework } from "../../../../services/sandbox/templates/template.registry.js";
import { saveWorkflow } from "../../../../services/planning/workflow/store.js";
import { detectExplicitFrameworkPreference } from "../../../../services/planning/frameworkPreference.js";

interface ResolveFrameworkParams {
  workflow: WorkflowState;
  framework: Framework | undefined;
  userRequest?: string;
}

export async function resolveFramework(
  params: ResolveFrameworkParams,
): Promise<Framework | undefined> {
  const { workflow, userRequest } = params;
  let { framework } = params;
  const explicitFramework = detectExplicitFrameworkPreference(userRequest);

  if (explicitFramework && framework !== explicitFramework) {
    framework = explicitFramework;
    workflow.context.framework = explicitFramework;
    if (workflow.context.intent) {
      workflow.context.intent.suggestedFramework = explicitFramework;
    }
    await saveWorkflow(workflow);
  }

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
