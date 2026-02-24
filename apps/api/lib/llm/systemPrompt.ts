import {
  CORE_SYSTEM_PROMPT as CORE_SYSTEM_PROMPT_SOURCE,
  MODE_PROMPTS as MODE_PROMPTS_SOURCE,
} from "./prompts/sections.js";

export const CORE_SYSTEM_PROMPT = `${CORE_SYSTEM_PROMPT_SOURCE}`;

export const MODE_PROMPTS = {
  fix: `${MODE_PROMPTS_SOURCE.fix}`,
  edit: `${MODE_PROMPTS_SOURCE.edit}`,
};
