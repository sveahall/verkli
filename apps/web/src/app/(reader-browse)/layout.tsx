import NavbarShell from "@/nav/NavbarShell";
import ReaderAppShell from "@/components/reader/ReaderAppShell";
import OfflineModeIndicator from "@/components/offline/OfflineModeIndicator";

/**
 * Reader browse layout - NO auth required.
 * For /reader/books/*, /reader/read/*, /reader/discover, /reader/authors/*
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
      <OfflineModeIndicator />
      <ReaderAppShell>{children}</ReaderAppShell>
    </>
  );
}
