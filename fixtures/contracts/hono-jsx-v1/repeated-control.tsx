import { createRoute } from "honox/factory";
export default createRoute((c) => c.render(
<form id="signup" method="post">{items.map((item) => <input name={item} />)}</form>
));
