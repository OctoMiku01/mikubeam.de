// Privacy policy (Datenschutzerklärung) for /datenschutz. Describes what this site actually does;
// keep it in sync when adding features that process visitor data.

export function privacyContent({ controller, esc, updated }) {
  const name = controller?.name ? esc(controller.name) : "";
  // An e-mail address becomes a mailto link.
  const rawContact = String(controller?.contact ?? "").trim();
  const contact = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(rawContact)
    ? `<a href="mailto:${esc(rawContact)}">${esc(rawContact)}</a>`
    : esc(rawContact);
  return `
    <h2>1. Verantwortlicher</h2>
    <p>Verantwortlich für die Datenverarbeitung auf dieser Website im Sinne der Datenschutz-Grundverordnung (DSGVO):</p>
    <p>${name || "<em>(Name folgt)</em>"}${contact ? `<br>Kontakt: ${contact}` : ""}</p>

    <h2>2. Das Wichtigste in Kürze</h2>
    <ul>
      <li>Diese Website setzt <strong>keine Cookies</strong> und verwendet <strong>kein Tracking</strong> und keine Analyse-Werkzeuge.</li>
      <li>Ihr Browser lädt beim Besuch <strong>nur Dateien von mikubeam.de</strong>. Schriften, Icons und Bilder werden nicht von fremden Servern (z.&nbsp;B. Google) geladen.</li>
      <li>Daten von anderen Diensten (GitHub, Last.fm, Twitch, Apple iTunes, Deezer, YouTube) ruft der Server ab. Dabei werden <strong>keine Daten über Sie</strong> an diese Dienste übermittelt.</li>
    </ul>

    <h2>3. Hosting durch Cloudflare</h2>
    <p>Diese Website wird über Cloudflare betrieben (Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA). Beim Aufruf der Website verarbeitet Cloudflare technisch notwendige Daten, insbesondere Ihre IP-Adresse, Datum und Uhrzeit des Zugriffs, die aufgerufene Adresse, den Browsertyp (User-Agent) und ggf. die zuvor besuchte Seite (Referrer). Ohne diese Daten kann die Website nicht ausgeliefert werden. Cloudflare nutzt sie außerdem, um die Website vor Angriffen zu schützen, und kann sie dafür kurzzeitig speichern.</p>
    <p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse liegt in einer sicheren, schnellen und zuverlässigen Bereitstellung der Website. Cloudflare kann Daten in den USA verarbeiten; Cloudflare ist nach dem EU-US Data Privacy Framework zertifiziert, auf dessen Grundlage die EU-Kommission ein angemessenes Datenschutzniveau festgestellt hat. Weitere Informationen: <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">cloudflare.com/privacypolicy</a>.</p>

    <h2>4. Besucherzähler</h2>
    <p>Auf der Startseite wird gezählt, wie oft sie aufgerufen wurde. Gespeichert wird dabei <strong>ausschließlich die Gesamtzahl</strong> – keine IP-Adresse, kein Cookie und nichts, was Sie wiedererkennbar macht. Um automatische Abrufe (z.&nbsp;B. Link-Vorschauen von Discord oder Suchmaschinen) nicht mitzuzählen, wird der vom Browser gesendete User-Agent beim Aufruf geprüft, aber nicht gespeichert.</p>

    <h2>5. Speicherung in Ihrem Browser</h2>
    <p>Wenn Sie oben rechts ein Farbschema auswählen, wird diese Auswahl im lokalen Speicher Ihres Browsers (localStorage) abgelegt, damit sie beim nächsten Besuch erhalten bleibt. Diese Information verlässt Ihren Browser nicht und wird nicht an den Server übertragen. Die Speicherung ist für die von Ihnen ausdrücklich gewünschte Funktion erforderlich (§&nbsp;25 Abs.&nbsp;2 Nr.&nbsp;2 TDDDG). Sie können sie jederzeit über die Einstellungen Ihres Browsers löschen.</p>

    <h2>6. Angezeigte Inhalte anderer Dienste</h2>
    <p>Einige Inhalte stammen von anderen Diensten und werden vom Server abgerufen, zwischengespeichert und von mikubeam.de ausgeliefert:</p>
    <ul>
      <li><strong>GitHub</strong> (GitHub, Inc., USA): Versionen, Downloads und Release-Notes der Projekte.</li>
      <li><strong>Last.fm</strong> (Last.fm Ltd., Großbritannien): welche Musik der Betreiber dieser Website hört.</li>
      <li><strong>Twitch</strong> (Twitch Interactive, Inc., USA): ob der Betreiber gerade streamt.</li>
      <li><strong>Apple iTunes, Deezer und YouTube</strong>: Album-Cover zu den angezeigten Songs.</li>
    </ul>
    <p>Diese Abrufe erfolgen durch den Server, nicht durch Ihren Browser. Ihre IP-Adresse oder andere Daten über Sie werden dabei nicht an diese Dienste übermittelt.</p>

    <h2>7. Links und Downloads</h2>
    <p>Diese Website enthält Links zu anderen Websites (z.&nbsp;B. GitHub, Discord, YouTube, Twitch). Die Download-Buttons auf der Mod-Seite laden die Dateien direkt von GitHub. Erst wenn Sie einen solchen Link anklicken, verbindet sich Ihr Browser mit dem jeweiligen Anbieter; ab dann gilt dessen Datenschutzerklärung.</p>

    <h2>8. Ihre Rechte</h2>
    <p>Sie haben das Recht auf Auskunft über Ihre gespeicherten Daten (Art. 15 DSGVO), auf Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) sowie das Recht, der Verarbeitung auf Grundlage berechtigter Interessen zu widersprechen (Art. 21). Wenden Sie sich dafür an den oben genannten Verantwortlichen. Da diese Website selbst keine Daten über Besucher speichert, wird eine Auskunft in der Regel ergeben, dass keine Daten über Sie vorliegen.</p>
    <p>Außerdem haben Sie das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO), insbesondere in dem Mitgliedstaat Ihres Aufenthaltsorts.</p>

    <p class="updated">Stand: ${esc(updated)}</p>`;
}
