# Dictation in English and Bangla

Any text box in SAFIX takes dictation: notes, the visit screen (advice, diagnoses, follow-up), the problem list, messages, Texts, the phone view. Click into a box and a small microphone appears in its corner.

- **Start and stop:** click the microphone, or press **F9** (or **Ctrl+Shift+Space**). The browser asks once to use the microphone.
- **Speak naturally and pause now and then.** Each time you pause, what you said is typed in at the cursor, while you carry on talking.
- **Language:** the panel that opens has **Auto**, **EN** and **বাংলা**. Auto handles English, Bangla and the two mixed in one sentence; pick one if Auto guesses wrong for you. The choice is remembered on that computer or phone.
- **Spoken commands:** "new line", "new paragraph", "full stop", "comma", "question mark", "colon" (or নতুন লাইন, নতুন অনুচ্ছেদ, দাঁড়ি, কমা). "Period" is not a command, since in a clinic it usually means a menstrual period.
- **Scratch that** (or মুছে ফেলো) removes the last piece typed.
- Moving the cursor to another box while dictating carries on in that box. Listening stops by itself after a minute of silence.
- Dictated text is ordinary typed text: read it over before signing, exactly as you would your own typing.

Medicine names, test names, doses and units come out in English letters even in Bangla sentences, the way Bangladeshi prescriptions are written ("Napa 500 mg 1+0+1 খাবার পরে"). The engine is told to expect the open patient's medicines and problems and a list of common Bangladeshi brands, generics, tests and abbreviations (src/lib/dictation/vocab.ts), so they are spelled right.

## How it works, and where the audio goes

1. The browser records speech in pieces, cut at each pause. Nothing is recorded until the microphone is pressed, and the microphone shows red with a "Listening" panel the whole time.
2. Each piece goes over HTTPS to the SAFIX server, which holds it in memory only for that request and never saves it.
3. The server sends the piece to the **speech engine** (ElevenLabs or OpenAI, below), which returns text.
4. If the Claude key is set, the text (not the audio) goes to **Claude** for a check of medicine and test names, numbers and punctuation. Claude is told never to add or change clinical content, and a result that differs too much in length is thrown away in favour of the engine's text. Turn this pass off with `MERIDIAN_DICTATION_POLISH=0`.
5. The text comes back and is typed in. The access log gets one "Dictated" line per dictation, with the patient whose chart was open; the words themselves are not logged.

Patient speech is patient information. The speech company receives the audio and Claude receives the text, under their API terms: none of them uses API data to train models, but each keeps request logs for a period (ElevenLabs keeps transcripts in the account's history unless zero-retention mode is on, which is an enterprise option; OpenAI keeps API data up to 30 days for abuse checks; Anthropic as in its commercial terms). Before dictating real patients, have whoever handles your data agreements check these terms, as for the lab-report reading that already uses Claude (docs/GO-LIVE.md).

## Setting it up

The microphone only appears once a speech engine is set up. On Render, open the **EMR** web service, **Environment**, and add one of these:

### ElevenLabs Scribe (recommended)

Strong Bangla, copes with English and Bangla mixed in one sentence, and takes a list of words to expect, which is how the patient's medicines and Bangladeshi brand names get spelled right.

1. Sign up at elevenlabs.io, choose a plan with API speech-to-text credit (the Starter plan is enough for one clinic), and create an API key under **Developers, API keys** with Speech to Text access.
2. Add `ELEVENLABS_API_KEY` = that key.

Cost: roughly US$0.22 to $0.40 per hour of speech depending on the plan, plus 20% for the expected-words list (check elevenlabs.io/pricing/api). A doctor dictating 30 minutes a day is a few dollars a month.

### OpenAI (alternative)

1. Create an API key at platform.openai.com and add some credit.
2. Add `OPENAI_API_KEY` = that key.

Uses `gpt-4o-transcribe`. Cost: about US$0.006 per minute ($0.36 per hour). It takes the expected words as a hint in its prompt rather than a list, so unusual brand names come out right less often.

### Optional settings

| Variable | What it does |
|---|---|
| `MERIDIAN_DICTATION_PROVIDER` | `elevenlabs` or `openai`, when both keys are set. Default: ElevenLabs if its key is set. |
| `MERIDIAN_DICTATION_MODEL` | A different model from the same company, e.g. `scribe_v1` or `gpt-4o-mini-transcribe`. |
| `MERIDIAN_DICTATION_POLISH` | `0` turns off the Claude check (step 4). |
| `MERIDIAN_DICTATION_POLISH_MODEL` | The Claude model for the check. Default: the one that reads lab reports (Claude Opus 5.5), under one US cent per pause. `claude-haiku-5-5` costs about a fortieth of that. |

After saving, Render restarts the app. Click into any note, press the microphone and say a sentence with a medicine name in it.

## When it doesn't work

- **"The microphone is blocked"**: click the icon at the left of the address bar, allow the microphone for this site, and try again.
- **No microphone in the box**: no speech key is set on the server, the box is read-only, or it is a number, date, password or phone field (those don't take dictation).
- **"The key was refused" or "out of credit"**: check the key and the account balance with the speech company.
- **For developers:** `MERIDIAN_DICTATION_FIXTURE="some text"` (not in production) returns that text for every piece, to work on the screens without a key.
