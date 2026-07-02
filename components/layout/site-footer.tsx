export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 py-6">
      <div className="container flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground md:flex-row">
        <p>PreMDB — predict the IMDb rating of unreleased movies.</p>
        <p>Movie data courtesy of TMDb. This product uses the TMDb API but is not endorsed or certified by TMDb.</p>
      </div>
    </footer>
  )
}
