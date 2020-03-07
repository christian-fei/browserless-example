const puppeteer = require('puppeteer')

main(process.argv[2])
  .then(() => console.log('finished, exiting') && process.exit(0))
  .catch(err => console.error(err) && process.exit(1))

async function main (baseurl = 'https://google.com', seen = new Set()) {
  const browser = await puppeteer.connect({ browserWSEndpoint: 'ws://localhost:3000' })
  const page = await browser.newPage()

  // await page.waitForNavigation()
  const internalLinks = [baseurl]

  console.log('internalLinks', internalLinks)
  do {
    const link = internalLinks.pop()
    console.log('processing', link)
    if (seen.has(link)) {
      console.log('  ..seen', link)
      continue
    }
    console.log('  ..crawling', link)
    seen.add(link)
    await page.goto(link.startsWith('/') ? `${baseurl}${link}` : link)
    const links = await page.evaluate((baseurl) => {
      return [...document.querySelectorAll(`a[href^="/"]`)].map(a => a.getAttribute('href'))
    }, baseurl)
    const newLinks = links.filter(l => !seen.has(l))
    console.log('  ..newLinks', newLinks.join(', '))
    internalLinks.push(...newLinks)
    console.log('progress', internalLinks.length, 'remaining', seen.size, 'crawled')
  } while (internalLinks.length > 0)

  await page.close()
  await browser.close()
}
