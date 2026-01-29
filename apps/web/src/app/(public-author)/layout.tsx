import NavbarShell from "@/nav/NavbarShell";
import Footer from "@/components/Footer";
import PublicRoleCta from "@/components/PublicRoleCta";

export default function PublicAuthorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <NavbarShell variant="PUBLIC_AUTHOR" />
      <PublicRoleCta targetRole="writer" href="/writer" label="Go to writer dashboard" />
      {children}
      <Footer variant="writer" />
    </>
  );
}
