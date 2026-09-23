import { notFound } from "next/navigation";
import PrivateAudioExportFixture from "./PrivateAudioExportFixture";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PrivateAudioExportFixture />;
}
