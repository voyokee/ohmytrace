// Reach relocated controls through the same drawer and disclosure used by a visitor.
export async function openTool(page,selector){
 if(!await page.locator(selector).isVisible()){
  if(!await page.locator('#my-dialog[open]').count())await page.locator('#btn-my').click();
  await page.locator('#my-dialog[open]').waitFor();
  if(selector==='#btn-data'&&!await page.locator('#my-advanced').evaluate(e=>e.open))await page.locator('#my-advanced>summary').click();
 }
 await page.locator(selector).click();
}
