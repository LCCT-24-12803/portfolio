# Making the contact form deliver (one-time setup)

The form posts to **FormSubmit** (formsubmit.co), a free service that forwards the message to
`mypreciousme09@gmail.com`. Nothing is stored in the site and no password is in the code.

## Do this once, after the site is online
1. Put the site on its real address (GitHub Pages: `https://lcct-24-12803.github.io/portfolio`).
   The form **cannot send when `index.html` is opened from your computer** (`file://`). The page tells
   visitors that and offers an "Open in my email app" button instead.
2. Open the live site, go to **Let's talk**, and send yourself a test message.
3. FormSubmit emails **mypreciousme09@gmail.com** an activation link. Open it and click it
   (check **Spam / Promotions** too). The very first message is held until you do this.
4. Send another test. It should now arrive in your inbox, with the visitor's address as Reply-To.

## What visitors see
- **Sent:** an animated confirmation. The form is only reported as sent when FormSubmit answers
  `success: "true"`. An error, an HTML page, a timeout (15 s) or no answer shows an error instead.
- **Not sent:** their text stays in the box and an **Open in my email app** button appears with the
  subject and message already filled in, so an enquiry is never lost.
- A hidden spam-trap field and a 15-second cooldown between sends are built in.

## Optional: hide your address from the page source
After step 3 FormSubmit can give you a random alias. Add it to `content.json`:
```json
"contact": { "email": "mypreciousme09@gmail.com", "formEndpoint": "your-random-alias" }
```
The `mailto:` links and the Copy button keep using your real address.
