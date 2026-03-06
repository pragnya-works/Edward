import { EdwardLogo } from "@edward/ui/components/brand/edwardLogo";

interface EdwardAvatarProps {
  isActive?: boolean;
}

export const EdwardAvatar = ({ isActive: _isActive }: EdwardAvatarProps = {}) => (
  <div className="relative shrink-0">
    <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg overflow-hidden">
      <EdwardLogo
        size={28}
        quality={68}
        sizes="(max-width: 640px) 24px, 28px"
        className="h-full w-full rounded-none object-cover scale-[1.2]"
      />
    </div>
  </div>
);
