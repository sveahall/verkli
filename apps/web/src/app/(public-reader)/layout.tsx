import NavbarShell from "@/nav/NavbarShell";

export default function PublicReaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <NavbarShell variant="PUBLIC_READER" />
      {children}
    </>
  );
}
