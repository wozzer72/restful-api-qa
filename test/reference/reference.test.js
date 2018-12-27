// tests for reference services

// mock the general console loggers - removes unnecessary output while running
// global.console = {
//     log: jest.fn(),
//     warn: jest.fn(),
//     error: jest.fn()
// }

const supertest = require('supertest');
const baseEndpoint = 'http://localhost:3000/api';
const apiEndpoint = supertest(baseEndpoint);

describe ("Expected reference services", async () => {
    beforeAll(async () => {
    });

    beforeEach(async () => {
    });

    it("should fetch services", async () => {
        const services = await apiEndpoint.get('/services')
            .expect('Content-Type', /json/)
            .expect(200);
        expect(services.body).toMatchSnapshot();
    });

    it("should fetch Non-CQC services by category", async () => {
        const services = await apiEndpoint.get('/services/byCategory?cqc=false')
            .expect('Content-Type', /json/)
            .expect(200);
        expect(services.body).toMatchSnapshot();
    });
    it("should fetch CQC services by category", async () => {
        const services = await apiEndpoint.get('/services/byCategory?cqc=true')
            .expect('Content-Type', /json/)
            .expect(200);
        expect(services.body).toMatchSnapshot();
    });

    it("should fetch jobs", async () => {
        const jobs = await apiEndpoint.get('/jobs')
            .expect('Content-Type', /json/)
            .expect(200);
        expect(jobs.body).toMatchSnapshot();
    });

    it("should fetch Local Authorities", async () => {
        const laS = await apiEndpoint.get('/localAuthority')
            .expect('Content-Type', /json/)
            .expect(200);
        expect(laS.body).toMatchSnapshot();
    });

});