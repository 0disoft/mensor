import { createRoute } from "honox/factory";
export default createRoute((c) => c.render(
<form id="signup" method="post"><button type="submit" formaction="/other">Join</button></form>
));
