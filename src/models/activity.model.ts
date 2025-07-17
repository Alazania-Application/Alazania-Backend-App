import { ActivityTypes } from "@/enums";
import { BaseModel } from "./base.model";

export interface IActivity extends BaseModel {
  type: `${ActivityTypes}`;
  metadata: Record<string, string>;
}
