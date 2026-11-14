package com.jvtech.gefinc.common.config;

import com.jvtech.gefinc.common.mail.MailMetrics;
import com.jvtech.gefinc.common.mail.MailRejectedExecutionHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/** Execução assíncrona: executor dedicado e limitado para o envio de e-mails. */
@Configuration
@EnableAsync
public class AsyncConfig {

  @Bean(name = "mailExecutor")
  ThreadPoolTaskExecutor mailExecutor(MailMetrics metrics) {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setThreadNamePrefix("mail-");
    executor.setCorePoolSize(2);
    executor.setMaxPoolSize(2);
    executor.setQueueCapacity(100);
    // Fila cheia ou pool em encerramento: descarta, avisa e conta, sem afetar a resposta (202).
    executor.setRejectedExecutionHandler(new MailRejectedExecutionHandler(metrics));
    executor.setWaitForTasksToCompleteOnShutdown(true);
    executor.setAwaitTerminationSeconds(30);
    return executor;
  }
}
