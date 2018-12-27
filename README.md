# restful-api-qa

This project demonstrates the use jest with it's test definition and assertion power
to remotely call upon (localhost) restful API to invoke actual endpoints, in various
different ways to drive characteristics and even dependency between successive calls
on the restful API.

It utilises mocking of data, allowing the generation of large volumes data with node.js Promises if required.

# To run
`npm test` of course. This runs in default mode whereby it is assumed not to clear down any data first.

`npm run clean:test` clears down all transactional data before running.

The "reference services" tests use snapshots. If needing to update the snapshots run: `npm -- -u test`

# Libraries
* jest
* supertest - abstract the calling and responding to restful endpoints
* faker - mock data generator
