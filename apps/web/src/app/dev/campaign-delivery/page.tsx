import { notFound } from "next/navigation";
import CampaignDeliveryPreview from "./CampaignDeliveryPreview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <CampaignDeliveryPreview />;
}
