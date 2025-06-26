import swaggerAutogen from 'swagger-autogen';
import { port } from './config';

const doc = {
  info: {
    version: 'v1.0.0',
    title: 'Alazania API',
    description: 'Your Social Hub, Reimagined.'
  },
  host: `localhost:${port || 8080}`,
  basePath: '/api/v1',
  schemes: ['http', 'https'],
};

const outputFile = './swagger-output.json';
// const endpointsFiles = ['src/routes/index.ts'];
// const endpointsFiles = [
//     'src/routes/auth.routes.ts',
//     'src/routes/user.routes.ts',
//     'src/routes/interest.routes.ts',
//     'src/routes/post.routes.ts'
//   ];
const endpointsFiles = ['swaggerEntry.ts']; 

swaggerAutogen()(outputFile, endpointsFiles, doc);