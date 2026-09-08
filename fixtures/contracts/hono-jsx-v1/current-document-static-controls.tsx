import { createRoute } from "honox/factory";
const items = ["one"];
export default createRoute((c) => c.render(
<><form id="signup" method="post"><fieldset><legend>Attendance</legend><input name="attendance" type="radio" value="yes" /><input name="attendance" type="radio" value="no" /><input name="blocked" type="text" disabled /></fieldset></form><ul>{items.map((item) => <li>{item}</li>)}</ul></>
));
