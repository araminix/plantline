import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { I18nProvider } from "./i18n/i18n";
import "@fontsource-variable/estedad";
import "@fontsource-variable/inter";
import "./app.css";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <I18nProvider>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </I18nProvider>
    </StrictMode>,
);
