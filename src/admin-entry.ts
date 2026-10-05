import { apiBase, $ } from "./common";
const destination = `${apiBase}/admin/`;
$<HTMLAnchorElement>("#admin-link").href = destination;
location.replace(destination);
