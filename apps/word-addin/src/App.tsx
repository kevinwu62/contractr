import { useEffect, useState } from "react";

type OfficeState = "loading" | "ready" | "unavailable";

export function App() {
  const [officeState, setOfficeState] = useState<OfficeState>("loading");
  const [selectedText, setSelectedText] = useState("");
  const [message, setMessage] = useState("Select text in Word, then click the button.");

  useEffect(() => {
    if (!window.Office) {
      setOfficeState("unavailable");
      setMessage("Open this task pane inside Microsoft Word to read selected text.");
      return;
    }

    Office.onReady((info) => {
      if (info.host === Office.HostType.Word) {
        setOfficeState("ready");
        setMessage("Select text in Word, then click the button.");
      } else {
        setOfficeState("unavailable");
        setMessage("Contractr is intended to run inside Microsoft Word.");
      }
    });
  }, []);

  async function readSelectedText() {
    if (officeState !== "ready") {
      return;
    }

    try {
      await Word.run(async (context) => {
        const selection = context.document.getSelection();
        selection.load("text");

        await context.sync();

        const text = selection.text.trim();
        setSelectedText(text);
        setMessage(text ? "Selected text:" : "No text is selected. Select text in Word and try again.");
      });
    } catch (error) {
      console.error("Unable to read selected text.", error);
      setMessage("Contractr could not read the selected text. Please try again.");
    }
  }

  return (
    <main className="app-shell">
      <section className="header">
        <p className="eyebrow">Word add-in</p>
        <h1>Contractr</h1>
      </section>

      <button className="primary-button" disabled={officeState !== "ready"} onClick={readSelectedText}>
        Read Selected Text
      </button>

      <section className="output" aria-live="polite">
        <p className="status">{message}</p>
        {selectedText ? <pre>{selectedText}</pre> : null}
      </section>
    </main>
  );
}
