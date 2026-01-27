import { Button } from "@edward/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@edward/ui/components/dialog";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignIn?: () => void | Promise<void>;
}

export function LoginModal({ isOpen, onClose, onSignIn }: LoginModalProps) {
  const handleLogin = async () => {
    try {
      if (onSignIn) {
        await onSignIn();
      }
      onClose();
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign in to continue</DialogTitle>
          <DialogDescription>
            Please sign in to access this feature. Sign in with your GitHub account.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button
            type="button"
            onClick={handleLogin}
            className="w-full sm:w-auto"
          >
            Sign in with GitHub
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}