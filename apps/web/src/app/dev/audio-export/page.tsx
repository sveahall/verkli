import { notFound } from "next/navigation";
import AudioExportFixture from "./AudioExportFixture";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AudioExportFixture />;
}
