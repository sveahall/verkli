import NavbarShell from "@/nav/NavbarShell";
import Footer from "@/components/Footer";
import PublicRoleCta from "@/components/PublicRoleCta";

export default function PublicReaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <NavbarShell variant="PUBLIC_READER" />
      <PublicRoleCta targetRole="reader" href="/reader/home" label="Go to reader dashboard" />
      {children}
      <Footer variant="reader" />
    </>
  );
}
