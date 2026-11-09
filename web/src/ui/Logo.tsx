/** The plantline mark, a feed, a busbar and three feeders, in the theme's colours (public/favicon.svg is the same mark). */
export function Logo({ size }: { size: number }) {
    return (
        <svg className="logo" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="var(--accent)" />
            <path d="M16 5v7M6 12h20M9 12v8M16 12v8M23 12v8" fill="none" stroke="var(--accent-ink)" strokeWidth="2.6" strokeLinecap="round" />
            {[9, 16, 23].map((cx) => (
                <circle key={cx} cx={cx} cy="23.5" r="2.4" fill="var(--accent-ink)" />
            ))}
        </svg>
    );
}
