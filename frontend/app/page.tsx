import { redirect } from "next/navigation";
import { appConfig } from "../config/app.config";

export default function HomePage() {
  redirect(appConfig.routes.home);
}