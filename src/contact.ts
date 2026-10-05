import { $, copy, loadContacts } from "./common";
void loadContacts();

$("#copy-group").addEventListener("click", (event) =>
  copy(
    $("#qq-group").textContent || "",
    event.currentTarget as HTMLButtonElement,
  ),
);
