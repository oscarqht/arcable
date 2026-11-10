export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "12vh auto",
        padding: 32,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <img src="/icon256.png" width={72} height={72} alt="Arcable" />
      <h1>Make the web your own.</h1>
      <p style={{ fontSize: 20, lineHeight: 1.7 }}>
        Arcable adds side panels to matching websites, runs your custom
        JavaScript and CSS, and brings useful browser tools to your context
        menu.
      </p>
      <h2>Set up your extension</h2>
      <p>
        Click the Arcable toolbar icon to open Options. Add Side Panels rules,
        customize sites, or manage scripts and automatic Picture-in-Picture.
      </p>
      <p>
        Connect Raindrop.io in Options to sync your rules between browsers. Each
        browser remembers its own panel positions, sizes, and docking choices.
      </p>
    </main>
  );
}
