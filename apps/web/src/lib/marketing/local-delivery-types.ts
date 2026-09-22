import type { ComponentProps } from "react";
import type { PostDrawer } from "@/features/author-workspaces/marketing/CampaignDetailView";
import type { DeliveryRecord } from "./delivery-ledger";

export type LocalPost = ComponentProps<typeof PostDrawer>["post"];
export type LocalDeliveryView = { post: LocalPost; deliveries: DeliveryRecord[] };
