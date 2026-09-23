import { notFound } from "next/navigation";
import ChannelConnectionsPreview from "./ChannelConnectionsPreview";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ChannelConnectionsPreview />;
}
