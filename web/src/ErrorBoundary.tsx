import { Component, type ReactNode } from "react";
import { AUTOSAVE_KEY } from "./diagram/DiagramEditor";
import { download } from "./diagram/export";
import { useI18n } from "./i18n/i18n";
import { readStored } from "./settings";

/** Instead of a blank page after an unexpected error: what happened, a reload, and the kept diagram to download. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: unknown) {
        console.error(error);
    }

    render() {
        return this.state.failed ? <Fallback /> : this.props.children;
    }
}

function Fallback() {
    const { t } = useI18n();
    const kept = readStored(AUTOSAVE_KEY);
    return (
        <div className="overlay" role="alert">
            <div className="dialog">
                <h1>{t("error.title")}</h1>
                <p>{t("error.body")}</p>
                <div className="row">
                    <button type="button" className="button primary" onClick={() => location.reload()}>
                        {t("error.reload")}
                    </button>
                    {typeof kept === "string" && (
                        <button type="button" className="button" onClick={() => download("diagram.plantline.json", kept, "application/json")}>
                            {t("error.download")}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
