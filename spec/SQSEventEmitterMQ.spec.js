const sinon = require('sinon');
const MessageQueue = require(
  '../node_modules/parse-server/lib/ParseMessageQueue').ParseMessageQueue;
const SQSEventEmitterMQ = require('../').SQSEventEmitterMQ;
const logger = require('parse-server').logger;

let config;

describe('SMSEventEmitterMQ', () => {
  beforeEach(() => {
    const response = {
      Messages: [{
        ReceiptHandle: 'receipt-handle',
        MessageId: '123',
        Body: 'body',
      }],
    };

    const sqs = sinon.mock();
    sqs.sendMessageBatch = sinon.stub();
    sqs.receiveMessage = sinon.stub().yieldsAsync(null, response);
    sqs.receiveMessage.onSecondCall().returns();
    sqs.deleteMessage = sinon.stub();

    config = {
      messageQueueAdapter: SQSEventEmitterMQ,
      queueUrl: 'test-queue',
      region: 'mock',
      sqs,
    };
  });

  xit('a test for real that can be done against a live queue', (done) => {
    const CHANNEL = 'foo';
    const MESSAGE = 'hi';

    const subscriber = MessageQueue.createSubscriber(config);
    const publisher = MessageQueue.createPublisher(config);

    subscriber.subscribe(CHANNEL);
    subscriber.on('message', (channel, message) => {
      expect(channel).toBe(CHANNEL);
      expect(message).toBe(MESSAGE);
      // need to give the aws-sdk some time to mark the message
      setTimeout(done, 500);
    });

    publisher.publish(CHANNEL, MESSAGE);
  }).pend('configure options for a real sqs endpoint');

  describe('subscriber', () => {
    it('should only have one subscription map', () => {
      const subscriber1 = MessageQueue.createSubscriber(config);
      subscriber1.subscribe('foo');
      const subscriber2 = MessageQueue.createSubscriber(config);
      subscriber2.subscribe('bar');
      // subscribe twice for coverage sake!
      subscriber2.subscribe('bar');
      expect(subscriber2.subscriptions === subscriber1.subscriptions).toBe(true);
    });

    it('should throw if no config', () => {
      expect(() => MessageQueue.createSubscriber({ messageQueueAdapter: SQSEventEmitterMQ }))
        .toThrow(new Error('No queueUrl found in config'));
    });

    it('should allow unsubscribe', () => {
      const subscriber = MessageQueue.createSubscriber(config);
      expect(() => subscriber.unsubscribe('foo')).not.toThrow();
    });

    it('calls the handleMessage function when a message is received', (done) => {
      const subscriber = MessageQueue.createSubscriber(config);
      subscriber.subscribe('message_processed');
      subscriber.on('message', (event, message) => {
        expect(event).toBe('message_processed');
        expect(message).toBe('body');
        done();
      });
    });
  });

  describe('publisher', () => {
    it('should throw if no config', () => {
      expect(() => MessageQueue.createPublisher({ messageQueueAdapter: SQSEventEmitterMQ }))
        .toThrow(new Error('Missing SQS consumer option [queueUrl].'));
    });

    it('should handle happy path', () => {
      expect(() => MessageQueue.createPublisher(config)).not.toThrow();
    });

    it('should publish', () => {
      const publisher = MessageQueue.createPublisher(config);
      expect(() => publisher.publish('foo', 'bar')).not.toThrow();
    });

    it('should error', () => {
      const publisher = MessageQueue.createPublisher(config);
      spyOn(logger, 'error');
      publisher.publish();
      const expectedError = new Error("Object messages must have 'id' and 'body' props");
      expect(logger.error).toHaveBeenCalledWith(expectedError);
    });

    it('should process a batch', () => {
      const publisher = MessageQueue.createPublisher(config);
      spyOn(publisher.emitter, 'send');
      publisher.publish('channel', ['foo', 'bar']);
      const payload = [
        { id: '0', body: 'foo' },
        { id: '1', body: 'bar' },
      ];
      expect(publisher.emitter.send).toHaveBeenCalledWith(payload, jasmine.any(Function));
    });
  });
});
