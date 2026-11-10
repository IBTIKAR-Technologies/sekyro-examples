import { bootstrapApplication } from "@angular/platform-browser";
// Registers <sekyro-verification> once (its stylesheet is in angular.json `styles`).
import "@sekyro/elements/define";
import { AppComponent } from "./app/app.component";

bootstrapApplication(AppComponent).catch((err: unknown) => console.error(err));
