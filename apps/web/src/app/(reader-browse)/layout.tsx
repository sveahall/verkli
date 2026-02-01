import NavbarShell from "@/nav/NavbarShell";
import ReaderAppShell from "@/components/reader/ReaderAppShell";

/**
 * Reader browse layout - NO auth required.
 * For /reader/books/*, /reader/read/*, /reader/discover, /reader/writers/*
 * MVP: Anonymous readers can browse public content.
 */
export default function ReaderBrowseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <NavbarShell variant="APP_READER" />
      <ReaderAppShell>{children}</ReaderAppShell>
    </>
  );
}
