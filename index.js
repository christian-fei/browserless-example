const puppeteer = require('puppeteer')

main(process.argv[2])
  .then(() => console.log('finished, exiting') && process.exit(0))
  .catch(err => console.error(err) && process.exit(1))

async function main (url = 'https://google.com') {
  const browser = await puppeteer.connect({ browserWSEndpoint: 'ws://localhost:3000' })
  const page = await browser.newPage()
  await page.goto(url)
  console.log('title', await page.title())
  console.log('content', await page.content())
  await page.close()
  await browser.close()
}
