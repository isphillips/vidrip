# App Review — reply to paste into Resolution Center

> Fill in the build/version. Prerequisites before sending: (1) host the Terms of Use at
> https://www.vidrip.app/terms and the Privacy Policy at https://www.vidrip.app/privacy (the reply
> links to them and quotes the privacy text — the quote must match what's hosted), and (2) attach the
> screen recording (EULA-before-login → report → block) in App Review Information → Notes.

---

Hello, and thank you for the detailed review. We've uploaded a new build (version 1.0, build N) that resolves all three items. Here is a point-by-point response.

**Guideline 3.1.1 — Business — Payments — In-App Purchase**

We have removed all purchasing of, pricing for, and external links to paid digital content from the app:

- The app contains no In-App Purchase and no other (e.g. web/external) purchase flow.
- We removed all price displays, all "subscribe" calls to action, and all subscription-management controls (cancel/resume), and we removed every link or call to action that directed users to purchase outside the app.
- When a viewer opens a members-only channel they are not a member of, the app now shows a neutral "Members only" message with no price, no purchase or subscribe button, and no link to buy anywhere — in or out of the app.
- The Account screen lists a user's existing memberships read-only (name only; no prices, no purchase, no management).

The app no longer offers, advertises, or facilitates the purchase of any digital content or subscription by any means.

**Guideline 1.2 — Safety — User-Generated Content**

The app includes all required precautions:

- **Filtering objectionable content:** user videos are screened by automated moderation before they post, and user-entered text (display names, handles, and captions) is filtered for objectionable language.
- **Flag objectionable content:** every reaction, comment, channel post, and user profile has a "Report" action that lets any user flag content for review.
- **Block abusive users:** any user can block another from the same menus. Blocking immediately removes the blocked user's content from the blocker's feeds and conversations, and files a report to our moderation team to review the offending content.
- **EULA / Terms of Use:** before a user can register or sign in, the Welcome screen presents an agreement to our Terms of Use and Privacy Policy (with tappable links), and account creation additionally requires the user to explicitly check "I agree to the Terms of Use and Privacy Policy." Our Terms of Use include a zero-tolerance policy for objectionable content and abusive users, with removal of content and ejection of violators (typically within 24 hours).
  - Terms of Use: https://www.vidrip.app/terms
  - Privacy Policy: https://www.vidrip.app/privacy

A screen recording captured on a physical device demonstrating (1) the EULA presented before login/registration, (2) the report/flag mechanism, and (3) the block mechanism is included in the App Review Information notes.

**Guideline 2.1 — Information Needed — Face Data**

- **What face data does the app collect?** Only when a user enables an optional AR "lens" effect while recording, the app detects facial-landmark coordinates (eye, nose, and mouth anchor points and a head-roll angle, plus an optional sparse face-outline mesh). The app does not collect face images, a face template/"faceprint", blendshapes, or gaze/iris data.
- **All planned uses of the collected face data:** solely to position and render the cosmetic AR effect on the live preview and recorded video, and to re-render that effect on playback. It is not used for identification, authentication, advertising, analytics, or any other purpose.
- **Shared with third parties? Where stored?** It is not shared with any third party. Face detection runs entirely on the user's device (MediaPipe Face Landmarker; no server or cloud face processing). The landmark coordinates are stored only as part of the user's own video's render recipe, in our backend (Supabase).
- **Retention:** the landmark coordinates are retained as part of the video's render data and are deleted when the user deletes the video or their account.
- **Where in the privacy policy this is explained:** the "Camera & face effects" section of our Privacy Policy at https://www.vidrip.app/privacy.
- **Quoted text from the privacy policy concerning face data:** "When you record a reaction, Vidrip uses your camera. If you choose an AR 'lens,' your device detects facial landmarks on your device to position the effect. This detection is performed locally using on-device machine learning; raw camera frames and facial geometry are not sent to our servers for this purpose. When a lens is used, a compact set of facial landmark coordinates (not images, not a faceprint) is saved with your video so the effect can be re-rendered on playback. We do not create a face template, do not use face data to identify you, and do not share it with third parties. You can delete your videos at any time, which removes this data."

Thank you — please let us know if any further detail would help.
