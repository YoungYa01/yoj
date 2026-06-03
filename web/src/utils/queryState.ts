export function getQueryString(searchParams: URLSearchParams, key: string, fallback = "") {
    return searchParams.get(key) ?? fallback;
}

export function getQueryNumber(searchParams: URLSearchParams, key: string, fallback = 1) {
    const value = Number(searchParams.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getOptionalQueryNumber(searchParams: URLSearchParams, key: string) {
    const value = Number(searchParams.get(key));
    return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function setListSearchParams(
    searchParams: URLSearchParams,
    setSearchParams: (next: URLSearchParams) => void,
    patch: Record<string, string | number | undefined | null>,
    resetPage = true
) {
    const next = new URLSearchParams(searchParams);

    Object.entries(patch).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") {
            next.delete(key);
        } else {
            next.set(key, String(value));
        }
    });

    if (resetPage && !Object.prototype.hasOwnProperty.call(patch, "page")) {
        next.set("page", "1");
    }

    setSearchParams(next);
}