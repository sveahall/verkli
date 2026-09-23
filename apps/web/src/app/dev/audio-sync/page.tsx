import { notFound } from "next/navigation";
import AudioSyncFixture from "./AudioSyncFixture";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AudioSyncFixture />;
}
