import { createRoute } from "honox/factory";
export default createRoute((c) => c.render(
<><form id="signup" method="post" action="/join"><label><input name="name" type="text" required /></label><button type="submit">Join</button></form></>
));
