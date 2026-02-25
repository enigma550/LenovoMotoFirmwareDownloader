import { requestApi } from "../../../../core/infra/lmsa/api";
import { USER_AGENT } from "../../../../core/infra/lmsa/constants";
import { cookieJar, session } from "../../../../core/infra/lmsa/state";
import { normalizeRemoteUrl, isRescueRecipeContent, asRecord, firstStringField, getRecipeSteps } from "../../firmware-package-utils";
import { basename } from "path";

export type RescueRecipeHints = {
    source: string;
    preferredFileNames: Set<string>;
    referenceCount: number;
};

async function fetchRecipeJson(recipeUrl: string) {
    const headers = new Headers({
        "User-Agent": USER_AGENT,
        Guid: session.guid,
    });
    const serializedCookies = serializeCookiesForRequest();
    if (serializedCookies) {
        headers.set("Cookie", serializedCookies);
    }
    if (session.jwt) {
        headers.set("Authorization", session.jwt);
    }

    const response = await fetch(recipeUrl, {
        method: "GET",
        headers,
    });
    if (!response.ok) {
        throw new Error(`Recipe request failed with status ${response.status}.`);
    }
    const text = await response.text();
    return JSON.parse(text) as unknown;
}

export async function resolveRescueRecipeHints(
    payload: {
        recipeUrl?: string;
        selectedParameters?: Record<string, string>;
    },
    dataReset: "yes" | "no",
) {
    let recipeContent: unknown = undefined;
    let source = "";

    const directRecipeUrl = normalizeRemoteUrl(payload.recipeUrl || "");
    if (directRecipeUrl) {
        recipeContent = await fetchRecipeJson(directRecipeUrl);
        if (!isRescueRecipeContent(recipeContent)) {
            throw new Error(
                "Provided recipe URL is not a rescue/flash recipe (expected LMSA_Rescue with FastbootFlash).",
            );
        }
        source = `direct:${basename(new URL(directRecipeUrl).pathname) || "recipe"}`;
    } else {
        const selectedParameters = payload.selectedParameters || {};
        const modelName =
            selectedParameters.modelName ||
            selectedParameters.modelCode ||
            selectedParameters.sku ||
            "";
        const marketName = selectedParameters.marketName || "";
        const category = selectedParameters.category || "";

        if (modelName || marketName) {
            const recipeInfoResponse = await requestApi(
                "/rescueDevice/getRescueModelRecipe.jhtml",
                {
                    modelName,
                    marketName,
                    category,
                },
            );
            const recipeInfoPayload = asRecord(await recipeInfoResponse.json());
            const code =
                typeof recipeInfoPayload?.code === "string"
                    ? recipeInfoPayload.code
                    : "";
            if (code === "0000") {
                const content = asRecord(recipeInfoPayload?.content);
                const recipeUrlFromApi = normalizeRemoteUrl(
                    firstStringField(content, ["flashFlow", "recipe"]),
                );
                if (recipeUrlFromApi) {
                    recipeContent = await fetchRecipeJson(recipeUrlFromApi);
                    if (!isRescueRecipeContent(recipeContent)) {
                        throw new Error(
                            "Model recipe URL resolved to a non-rescue flow. Falling back to local XML/script.",
                        );
                    }
                    source = `api:${basename(new URL(recipeUrlFromApi).pathname) || "recipe"}`;
                } else if (firstStringField(content, ["readFlow"])) {
                    throw new Error(
                        "Model recipe returned readFlow-only data. Rescue Lite only accepts flashFlow recipes.",
                    );
                } else if (
                    Array.isArray(content?.Steps) ||
                    Array.isArray(content?.steps)
                ) {
                    if (!isRescueRecipeContent(content)) {
                        throw new Error(
                            "Inline recipe data is not a rescue/flash recipe. Falling back to local XML/script.",
                        );
                    }
                    recipeContent = content;
                    source = "api:inline";
                }
            }
        }
    }

    if (!recipeContent) return undefined;
    const references = collectRecipeReferences(recipeContent);
    const preferredFileNames = new Set<string>();
    for (const reference of references) {
        mapRecipeReferenceToPreferredFileNames(
            reference,
            dataReset,
            preferredFileNames,
        );
    }
    if (preferredFileNames.size === 0) return undefined;

    return {
        source: source || "recipe",
        preferredFileNames,
        referenceCount: references.length,
    } as RescueRecipeHints;
}

function collectRecipeReferences(recipeContent: unknown) {
    const references: string[] = [];
    const steps = getRecipeSteps(recipeContent);

    for (const stepRaw of steps) {
        const step = asRecord(stepRaw);
        if (!step) continue;
        const stepName = firstStringField(step, ["Step", "step"]).toLowerCase();
        const args = asRecord(step.Args) || asRecord(step.args);
        if (!args) continue;

        if (stepName.includes("loadfiles")) {
            const files =
                (Array.isArray(args.Files) && args.Files) ||
                (Array.isArray(args.files) && args.files) ||
                [];
            for (const file of files) {
                if (typeof file === "string" && file.trim()) {
                    references.push(file.trim());
                }
            }
        }

        if (stepName.includes("fastbootflash")) {
            const xmlValue = firstStringField(args, ["XML", "xml"]);
            if (xmlValue) {
                references.push(xmlValue);
            }
        }

        if (stepName.includes("fastbootmodifyflashfile")) {
            const fileValue = firstStringField(args, ["File", "file"]);
            if (fileValue) {
                references.push(fileValue);
            }
        }
    }

    return references;
}

function mapRecipeReferenceToPreferredFileNames(
    reference: string,
    dataReset: "yes" | "no",
    collector: Set<string>,
) {
    const normalized = reference.trim().replace(/^\$+/, "").toLowerCase();
    if (!normalized) return;
    const base = basename(normalized);

    if (normalized === "xmlfile") {
        collector.add(dataReset === "yes" ? "flashfile.xml" : "servicefile.xml");
        collector.add("flashfile.xml");
        collector.add("servicefile.xml");
        return;
    }
    if (normalized === "upgradexmlfile") {
        collector.add("servicefile.xml");
        return;
    }
    if (normalized === "softwareupgrade") {
        collector.add("softwareupgrade.xml");
        return;
    }
    if (normalized.startsWith("flashinfo")) {
        collector.add("flashinfo.xml");
        collector.add("flashinfo_rsa.xml");
        return;
    }
    if (normalized === "efuse") {
        collector.add("efuse.xml");
        return;
    }
    if (normalized === "lkbin") {
        collector.add("lkbin.xml");
        return;
    }
    if (base.endsWith(".xml") || base.endsWith(".bat") || base.endsWith(".sh")) {
        collector.add(base);
    }
}

function serializeCookiesForRequest() {
    return [...cookieJar.entries()]
        .map(([cookieName, cookieValue]) => `${cookieName}=${cookieValue}`)
        .join("; ");
}