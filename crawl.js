const puppeteer = require('puppeteer')
const plimit = require('p-queue')
const { default: PQueue } = require('p-queue')

main(process.argv[2])
  .then(() => console.log('finished, exiting') && process.exit(0))
  .catch(err => console.error(err) && process.exit(1))

async function main (baseurl = 'https://google.com', seen = new Set()) {
  const queue = new PQueue({ concurrency: 10 })

  const browser = await puppeteer.connect({ browserWSEndpoint: 'ws://localhost:3000' })

  const linksToCrawls = [baseurl]

  queue.add(() => crawl(baseurl, { linksToCrawls, seen, queue }))

  async function crawl (link, { linksToCrawls, seen, queue }) {
    const page = await browser.newPage()
    console.log('processing', link)
    if (!link || seen.has(link)) return console.log('  ..seen', link)

    console.log('  ..crawling', link)
    seen.add(link)

    await page.goto(link.startsWith('/') ? `${baseurl}${link}` : link)

    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(_ => {})

    const links = await page.evaluate((baseurl) => {
      return [...document.querySelectorAll(`a[href^="/"]`)].map(a => a.getAttribute('href'))
    }, baseurl)
    const newLinks = links.filter(l => !seen.has(l))

    newLinks.length > 0 && console.log('  ..newLinks', newLinks.join(', '))

    linksToCrawls.push(...newLinks)

    newLinks.forEach(l => queue.add(() => crawl(l, { linksToCrawls, seen, queue })))

    console.log('progress', seen.size, 'crawled', 'queue size', queue.size, 'pending', queue.pending)

    await page.close()
  }

  await queue.onIdle()

  await browser.close()
}
