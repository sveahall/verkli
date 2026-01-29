import NavbarShell from "@/nav/NavbarShell";

export default function PublicAuthorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <NavbarShell variant="PUBLIC_AUTHOR" />
      {children}
    </>
  );
}
