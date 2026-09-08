import { createRoute } from "honox/factory";
export default createRoute((c) => c.render(
<form id="signup" method="post">{visible && <input name="name" />}</form>
));
