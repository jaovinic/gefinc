package com.jvtech.gefinc.category;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Toda consulta é filtrada pelo usuário dono (Princípio III). */
public interface CategoryRepository extends JpaRepository<Category, Long> {

  @Query("select c from Category c where c.userId = :userId order by c.type, lower(c.name)")
  List<Category> findAllOfUser(@Param("userId") long userId);

  @Query(
      "select c from Category c where c.userId = :userId and c.type = :type order by lower(c.name)")
  List<Category> findAllOfUserByType(
      @Param("userId") long userId, @Param("type") CategoryType type);

  Optional<Category> findByIdAndUserId(long id, long userId);

  @Query(
      "select count(c) > 0 from Category c where c.userId = :userId and c.type = :type"
          + " and lower(c.name) = lower(:name) and (:excludeId is null or c.id <> :excludeId)")
  boolean nameExists(
      @Param("userId") long userId,
      @Param("type") CategoryType type,
      @Param("name") String name,
      @Param("excludeId") Long excludeId);
}
