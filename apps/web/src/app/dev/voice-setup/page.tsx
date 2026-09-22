import { notFound } from "next/navigation";
import VoiceSetupFixture from "./VoiceSetupFixture";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <VoiceSetupFixture />;
}
