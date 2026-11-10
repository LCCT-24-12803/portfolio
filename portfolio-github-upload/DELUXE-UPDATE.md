# Deluxe interaction update

## Direct email sending
The contact form now submits in the background using FormSubmit's AJAX endpoint. It does not open the visitor's mail app.

**One-time activation required:** on the first real submission, FormSubmit sends an activation/confirmation email to `mypreciousme09@gmail.com`. Open that email and activate the endpoint. After activation, submissions are delivered directly to the inbox. This third-party service is used because this portfolio is a static site and cannot securely send email by itself.

For production, consider moving to a private backend or a verified email provider account. Do not put SMTP passwords or private API secrets in frontend JavaScript.

## New interactions
- Animated particle field and ambient cursor aura
- Cinematic loading reveal
- More dimensional orbital core and hero tilt
- Animated project transitions and shimmer
- Project thumbnail selector rail
- Hover lift/glow on skill and certificate cards
- Animated section underline and marquee accents
- Reduced-motion support

## Preview
Run from the project root:
`python -m http.server 8000`
Then open `http://localhost:8000/`.
