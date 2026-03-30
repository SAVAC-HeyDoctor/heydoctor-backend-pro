import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return ok', () => {
      expect(appController.root()).toBe('ok');
    });
  });

  describe('health', () => {
    it('should return ok', () => {
      expect(appController.health()).toBe('ok');
    });
  });
});
