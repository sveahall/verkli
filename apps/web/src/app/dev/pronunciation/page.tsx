import { notFound } from "next/navigation";
import PronunciationFixture from "./PronunciationFixture";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PronunciationFixture />;
}
