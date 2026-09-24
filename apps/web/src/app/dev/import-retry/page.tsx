import { notFound } from "next/navigation";
import ImportRetryFixture from "./ImportRetryFixture";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ImportRetryFixture />;
}
