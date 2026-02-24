export interface DesktopSandboxUiState {
  isTransitioning: boolean;
  keepMounted: boolean;
}

export type DesktopSandboxUiAction =
  | { type: "SYNC_FOR_MOBILE"; sandboxOpen: boolean }
  | { type: "START_OPEN_TRANSITION" }
  | { type: "FINISH_OPEN_TRANSITION" }
  | { type: "START_CLOSE_TRANSITION" }
  | { type: "FINISH_CLOSE_TRANSITION" };

export const INITIAL_DESKTOP_SANDBOX_UI_STATE: DesktopSandboxUiState = {
  isTransitioning: false,
  keepMounted: false,
};

export function desktopSandboxUiReducer(
  state: DesktopSandboxUiState,
  action: DesktopSandboxUiAction,
): DesktopSandboxUiState {
  switch (action.type) {
    case "SYNC_FOR_MOBILE":
      return {
        isTransitioning: false,
        keepMounted: action.sandboxOpen,
      };
    case "START_OPEN_TRANSITION":
      return {
        isTransitioning: true,
        keepMounted: true,
      };
    case "FINISH_OPEN_TRANSITION":
      return {
        isTransitioning: false,
        keepMounted: true,
      };
    case "START_CLOSE_TRANSITION":
      return {
        isTransitioning: true,
        keepMounted: true,
      };
    case "FINISH_CLOSE_TRANSITION":
      return {
        isTransitioning: false,
        keepMounted: false,
      };
    default:
      return state;
  }
}
