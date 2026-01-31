import GlobalNavbar from "@/components/navbar/GlobalNavbar";
import { NAV_CONFIG, type NavVariant } from "@/nav/navConfig";

const navModeFromVariant = (variant: NavVariant) => {
  if (variant === "APP_AUTHOR") return "author";
  if (variant === "APP_READER") return "reader";
  return "public";
};

export default function NavbarShell({ variant }: { variant: NavVariant }) {
  const config = NAV_CONFIG[variant];
  const navMode = navModeFromVariant(variant);

  return (
    <GlobalNavbar
      navMode={navMode}
      navLinks={config.links}
      navActions={config.actions}
      homeHref={config.homeHref}
    />
  );
}
